import datetime, math
def msl_sol(dt):
    """Curiosity mission sol (Gale LMST) from UTC datetime (Allison & McEwen 2000 / Mars24)."""
    jd_ut = dt.replace(tzinfo=None).timestamp() / 86400.0 + 2440587.5 if dt.tzinfo is None else dt.timestamp()/86400.0+2440587.5
    jd_tt = jd_ut + 69.184 / 86400.0
    msd = (jd_tt - 2405522.0028779) / 1.0274912517
    return math.floor(msd + 137.42 / 360.0) - 49269

def msl_sol_noon_utc(sol):
    """UTC datetime of local mean solar noon (LMST 12:00) at Gale for a Curiosity sol."""
    msd = sol + 49269 + 0.5 - 137.42 / 360.0
    jd_tt = msd * 1.0274912517 + 2405522.0028779
    unix = (jd_tt - 69.184 / 86400.0 - 2440587.5) * 86400.0
    return datetime.datetime.fromtimestamp(unix, datetime.timezone.utc)
