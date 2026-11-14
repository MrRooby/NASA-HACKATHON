# deploy: CI/CD i uruchomienie na serwerze zespołu

Stos produkcyjny to trzy kontenery z `deploy/docker-compose.yml`:

| Usługa | Obraz | Port (tylko na `BIND_IP`) |
|---|---|---|
| `mariadb` | `mariadb:11.4` + schemat z `DATABASE/schema/001…012` | `3306` |
| `mother` | `ghcr.io/mrrooby/nasa-hackathon-mother` (FastAPI: tylko API `/api/*`) | `8000` |
| `gui` | `ghcr.io/mrrooby/nasa-hackathon-gui` (nginx z buildem Vite, `/api/` → `mother:8000`) | `8081` |

`DATABASE/docker-compose.yml` zostaje bez zmian jako osobny stos samej bazy.

## Workflowy (`.github/workflows/`)

| Plik | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | push (poza `master` i `release/**`, które buduje `release.yml`) i pull request | `validate_config.py`; testy MOTHER (`pytest`); testy jednostkowe DATABASE; testy integracyjne DATABASE na kontenerze MariaDB 11.4; GUI: `npm ci`, `npm test --if-present`, `npm run build`, artefakt `gui-dist`. Brak katalogu z testami = krok pominięty z komunikatem. |
| `release.yml` | push na `master` / `release/**`, push taga `v*.*.*`, ręcznie | te same testy (wywołuje `ci.yml`), paczki (artefakt `release-bundles`; przy gałęzi wersja = `<gałąź>-<sha7>`): `awernasa-gui-dist-X.Y.Z.zip`, `mother-X.Y.Z.zip` (bez testów i `.env`), `database-X.Y.Z.tar.gz`, `deploy-X.Y.Z.tar.gz`, `SHA256SUMS.txt`; obrazy do GHCR (gałąź: tagi `<gałąź>` i `sha-<sha7>`; tag wersji: `X.Y.Z` i `latest`); GitHub Release z automatycznymi notatkami **tylko dla taga**. |
| `deploy.yml` | ręcznie (Actions → Deploy → Run workflow) albo po udanym Release **dla taga `v*`** | łączy się z tailnetem (Tailscale OAuth, `tag:ci`), przez SSH na serwerze: `git pull --ff-only`, `docker compose pull mother gui`, `docker compose up -d`. Bez sekretów kończy się komunikatem „Deploy skipped” zamiast błędu. |

Testy integracyjne DATABASE w CI dostają zmienne: `ASTRO_TEST_DB_HOST=127.0.0.1`, `ASTRO_TEST_DB_PORT=3306`, `ASTRO_TEST_DB_USER=root`, `ASTRO_TEST_DB_ROOT_PASSWORD` (jednorazowe hasło kontenera CI, nie sekret).

## Sekrety GitHub (Settings → Secrets and variables → Actions)

| Sekret | Do czego |
|---|---|
| `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | klient OAuth Tailscale (scope `auth_keys` / Devices: write) z tagiem `tag:ci`. Tag musi być w `tagOwners` w ACL tailnetu, a ACL musi pozwalać `tag:ci` na port 22 serwera. |
| `DEPLOY_HOST` | adres serwera w tailnecie (nazwa MagicDNS albo IP `100.x`) |
| `DEPLOY_USER` | użytkownik SSH na serwerze (w grupie `docker`) |
| `DEPLOY_SSH_KEY` | klucz prywatny (np. ed25519) dedykowany do deployu; publiczny w `~/.ssh/authorized_keys` tego użytkownika |
| `DEPLOY_PATH` | ścieżka klonu repo na serwerze, np. `/opt/nasa-hackathon` |
| `DEPLOY_KNOWN_HOSTS` (opcjonalny) | wynik `ssh-keyscan <DEPLOY_HOST>`; bez niego workflow ufa kluczowi hosta widzianemu przy pierwszym połączeniu |

`release.yml` publikuje obrazy przez wbudowany `GITHUB_TOKEN` (`packages: write`), dodatkowe sekrety nie są potrzebne.

## Pierwsze uruchomienie serwera

```bash
# 1. Docker Engine + compose plugin: https://docs.docker.com/engine/install/
sudo usermod -aG docker "$USER"            # potem wyloguj się i zaloguj
# 2. Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4                            # ten adres wpisz jako BIND_IP
# 3. Repozytorium i konfiguracja
sudo mkdir -p /opt/nasa-hackathon && sudo chown "$USER" /opt/nasa-hackathon
git clone https://github.com/MrRooby/NASA-HACKATHON.git /opt/nasa-hackathon
cd /opt/nasa-hackathon
cp deploy/.env.example deploy/.env         # uzupełnij hasła i BIND_IP; plik nie trafia do gita
# 4. Start
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
```

- Schemat wykonuje się tylko przy pierwszym starcie (pusty wolumen `astro_db_data`). Dane ładuje się potem skryptami z `DATABASE/etl` (patrz `DATABASE/README.md`), z `DB_HOST=<BIND_IP>` i hasłem `astro_etl` z `deploy/.env`.
- Jeśli na tym samym serwerze działa już stos z `DATABASE/docker-compose.yml`, port 3306 będzie zajęty. Albo zmień `DB_PUBLISH_PORT`, albo podłącz MOTHER do istniejącej bazy (`MOTHER_DB_HOST=<Tailscale IP>` w `deploy/.env`) i uruchamiaj tylko `docker compose -f deploy/docker-compose.yml up -d --no-deps mother gui`.
- Obrazy w GHCR są domyślnie prywatne. Albo ustaw je jako publiczne (GitHub → Packages → package settings → visibility), albo zaloguj serwer: `docker login ghcr.io` z tokenem `read:packages`.
- Bez GHCR (np. przed pierwszym release) obrazy da się zbudować na serwerze: `docker compose -f deploy/docker-compose.yml up -d --build`.
- Adresy: GUI `http://<BIND_IP>:8081`, API MOTHER `http://<BIND_IP>:8000/api/status` (dokumentacja: `/api/docs`).

## Wydanie wersji (robi właściciel repo)

```bash
git checkout master && git pull
git tag v0.1.0
git push origin v0.1.0
```

Tag z myślnikiem (np. `v0.2.0-rc1`) tworzy pre-release. Po udanym Release automatycznie rusza Deploy z obrazami tej wersji (jeśli sekrety są ustawione).

## Rollback

- Z GitHuba: Actions → Deploy → Run workflow, w polu `image_tag` wpisz poprzednią wersję bez `v`, np. `0.1.0`.
- Na serwerze: w `deploy/.env` ustaw `IMAGE_TAG=0.1.0`, potem `docker compose -f deploy/docker-compose.yml pull mother gui && docker compose -f deploy/docker-compose.yml up -d`.
- Rollback nie dotyka danych w bazie. Zmiany schematu wymagają `docker compose -f deploy/docker-compose.yml down -v` (**kasuje dane**) i ponownego importu.

## Alternatywa: self-hosted runner na serwerze

Zamiast Tailscale + SSH można zainstalować runner GitHub Actions bezpośrednio na serwerze (Settings → Actions → Runners → New self-hosted runner, etykieta np. `team-server`, użytkownik w grupie `docker`). Wtedy job deployu to po prostu:

```yaml
jobs:
  deploy:
    runs-on: [self-hosted, team-server]
    steps:
      - run: |
          cd /opt/nasa-hackathon
          git pull --ff-only
          docker compose -f deploy/docker-compose.yml pull mother gui
          docker compose -f deploy/docker-compose.yml up -d
```

Plusy: brak sekretów SSH/Tailscale i otwartych portów, runner łączy się do GitHuba sam. Minus: repo jest publiczne, więc runner **nie może** obsługiwać zdarzeń `pull_request` z forków (obcy kod wykonałby się na serwerze). Używaj go tylko w workflowach `workflow_dispatch` / tag push i ogranicz runner do tego repo.
