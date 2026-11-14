// Stand-in for a screen component in the shell tests: shows the props every screen
// receives and offers buttons that call navigate / setViewedCode like a real screen would.
export function stubScreen(id) {
  function ScreenStub({ mother, session, viewedCode, setViewedCode, navigate, profile }) {
    return (
      <div
        data-testid={`stub-${id}`}
        data-session={session}
        data-viewed={viewedCode}
        data-profile={profile?.name ?? ''}
        data-selected={mother?.selectedCode ?? ''}
        data-report-subject={mother?.report?.subject?.code ?? ''}
      >
        <button type="button" onClick={() => navigate('wearables')}>stub: wearables</button>
        <button type="button" onClick={() => navigate('profile', { viewedCode: 'HAB-C3' })}>stub: profile of C3</button>
        <button type="button" onClick={() => setViewedCode('HAB-C4')}>stub: view C4</button>
        <button type="button" onClick={() => setViewedCode(null)}>stub: view self</button>
        <button type="button" onClick={() => navigate('nowhere')}>stub: unknown screen</button>
      </div>
    );
  }
  return { default: ScreenStub };
}
