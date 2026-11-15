import React, { useId, useState } from 'react';
import { Button } from '../components/index.js';
import { useT } from '../i18n/index.js';
import { addNote, listNotes } from '../data/crewStore.js';
import { useStoreList } from './useStoreList.js';

/**
 * NOTES popup body: notes / diary of one crew member. Not connected yet: crewStore has no
 * backend for notes, so the list is empty and the input is disabled. The moment listNotes()
 * answers with `connected: true` the form works without changes here (see GUI/TODO.md, section a).
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

  if (!isOwn) return <p className="pf-empty">{t('profile.notesPrivate')}</p>;

  return (
    <div className="pf-notes">
      {!notes.connected ? <p className="pf-note-off">{t('profile.notesHint')}</p> : null}
      {notes.items.length === 0 ? (
        <p className="pf-empty">{t('profile.notesEmpty')}</p>
      ) : (
        <ol className="pf-note-list">
          {notes.items.slice(0, 3).map(note => (
            <li key={note.id} className="pf-note">
              <span className="pf-dim">{note.sol != null ? t('common.solN', { n: note.sol }) : t('common.solUnknown')}</span>
              <p>{note.text}</p>
            </li>
          ))}
        </ol>
      )}

      <form className="pf-note-form" onSubmit={save}>
        <label className="pf-label" htmlFor={inputId}>{t('profile.notesInputLabel')}</label>
        <textarea
          id={inputId}
          className="pf-note-input"
          rows={3}
          value={text}
          disabled={!canWrite}
          placeholder={canWrite ? t('profile.notesPlaceholder') : t('profile.notesDisabledPlaceholder')}
          onChange={event => setText(event.target.value)}
        />
        <div className="pf-actions">
          <Button type="submit" variant="primary" className="pf-big" disabled={!canWrite || !text.trim()}>{t('profile.notesSave')}</Button>
          {failure ? <span className="text-alert" role="alert">{failure}</span> : null}
        </div>
      </form>
    </div>
  );
}
