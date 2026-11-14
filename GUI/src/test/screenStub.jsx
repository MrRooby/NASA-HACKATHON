// Stand-in for a screen component in the shell tests: shows the props every screen
// receives ({ mother, route, navigate, back }) and buttons that navigate like a real screen.
export function stubScreen(id) {
  function ScreenStub({ mother, route, navigate, back }) {
    return (
      <div
        data-testid={`stub-${id}`}
        data-route={JSON.stringify(route)}
        data-selected={mother?.selectedCode ?? ''}
      >
        <button type="button" onClick={() => navigate({ screen: 'person', code: 'HAB-C3' })}>stub: person C3</button>
        <button type="button" onClick={() => navigate({ screen: 'person', code: 'HAB-C4', organ: 'limbs' })}>stub: C4 limbs</button>
        <button type="button" onClick={() => navigate({ organ: 'heart' })}>stub: organ heart</button>
        <button type="button" onClick={() => navigate({ screen: 'test', code: 'HAB-C2', test: 'full' })}>stub: run test</button>
        <button type="button" onClick={() => navigate({ screen: 'base', room: 'gym' })}>stub: base gym</button>
        <button type="button" onClick={() => navigate({ screen: 'nowhere' })}>stub: unknown screen</button>
        <button type="button" onClick={back}>stub: back</button>
      </div>
    );
  }
  return { default: ScreenStub };
}

// Stand-in for src/tasks (TaskPanel / AlertPanel / hooks) in the shell tests.
export function stubTasks({ alert = 2, caution = 3, open = 4 } = {}) {
  return {
    useTasks: () => ({ items: Array.from({ length: open }, (_, i) => ({ id: `t${i}`, done: false })), toggleDone: () => {} }),
    useAlerts: () => ({ items: [] }),
    useAlertCounts: () => ({ alert, caution }),
    TaskPanel: ({ route }) => <div data-testid="task-panel" data-screen={route?.screen} />,
    AlertPanel: ({ route }) => <div data-testid="alert-panel" data-screen={route?.screen} />,
  };
}
