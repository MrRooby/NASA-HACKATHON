// Where a finished session goes. `apiSink` = the astronaut app (POST to MOTHER + offline queue),
// `localSink` = standalone self-test mode (this browser only; never touches the network).
import { addSession } from './localStore.js';
import { submitSession } from './queue.js';

export const apiSink = {
  name: 'api',
  submit: payload => submitSession(payload),
  messages: null,
};

export const localSink = {
  name: 'local',
  async submit(payload) {
    try {
      const { record } = addSession(payload);
      return { state: 'local', response: { status: record.local_result.status, ...record.local_result } };
    } catch (error) {
      return { state: 'rejected', error };
    }
  },
  messages: {
    local: 'Saved in this browser only. Export your data to keep a copy.',
    rejected: 'Could not save: browser storage is full or blocked. Export what you have and clear old data.',
  },
};
