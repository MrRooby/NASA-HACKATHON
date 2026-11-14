import React, { useId, useState } from 'react';
import { Badge, Button, Panel } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { addNote, listNotes } from '../data/crewStore.js';
import { useStoreList } from './useStoreList.js';

/**
 * Notes / diary of one crew member. SKELETON: crewStore has no backend for notes yet, so
 * the list is empty and the input is disabled. The moment listNotes() answers with
 * `connected: true` the form works without changes here (see GUI/TODO.md, section a).
 * props: crewCode ('HAB-C1'), isOwn (only the author writes and reads), sol (current sol or null).
 */
export default function NotesPanel({ crewCode, isOwn, sol = null }) {
  const t = useT();
  const inputId = useId();
  const notes = useStoreList(() => listNotes(crewCode), [crewCode]);
  const [text, setText] = useState('');
  const [failure, setFailure] = useState(null);
  const canWrite = isOwn && notes.connected;

  const save = async event => {
    event.preventDefault();
    if (!canWrite || !text.trim()) return;
    setFailure(null);
    try {
      await addNote(crewCode, { text: text.trim(), sol });
      setText('');
      notes.reload();
    } catch (error) {
      setFailure(error?.message || String(error));
    }
  };

  return (
    <Panel
      className="profile-notes"
      title={t('profile.notesTitle')}
      meta={notes.connected ? null : <Badge kind="todo" data-testid="notes-todo">{t('profile.notConnected')}</Badge>}
    >
      <p className="profile-hint">{t('profile.notesHint')}</p>

      {!isOwn ? (
        <p className="profile-empty">{t('profile.notesPrivate')}</p>
      ) : (
        <>
          {notes.items.length === 0 ? (
            <p className="profile-empty">{t('profile.notesEmpty')}</p>
          ) : (
            <ol className="profile-note-list">
              {notes.items.map(note => (
                <li key={note.id} className="profile-note">
                  <span className="label">{note.sol != null ? t('common.solN', { n: note.sol }) : t('common.solUnknown')}</span>
                  <p>{note.text}</p>
                </li>
              ))}
            </ol>
          )}

          <form className="profile-note-form" onSubmit={save}>
            <label className="label" htmlFor={inputId}>{t('profile.notesInputLabel')}</label>
            <textarea
              id={inputId}
              className="profile-note-input"
              rows={4}
              value={text}
              disabled={!canWrite}
              placeholder={canWrite ? t('profile.notesPlaceholder') : t('profile.notesDisabledPlaceholder')}
              onChange={event => setText(event.target.value)}
            />
            <div className="row">
              <Button type="submit" variant="primary" disabled={!canWrite || !text.trim()}>{t('profile.notesSave')}</Button>
              {failure ? <span className="text-alert small" role="alert">{failure}</span> : null}
            </div>
          </form>
        </>
      )}
    </Panel>
  );
}
