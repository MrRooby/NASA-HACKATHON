import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, mergeRoute, normalizeRoute, parentRoute, routeFromSearch, routeToSearch, sameRoute } from './route.js';

describe('route helpers', () => {
  it('normalizes unknown or incomplete routes to crew', () => {
    expect(normalizeRoute({ screen: 'nowhere' })).toEqual(DEFAULT_ROUTE);
    expect(normalizeRoute({ screen: 'person' })).toEqual(DEFAULT_ROUTE);
    expect(normalizeRoute('base')).toMatchObject({ screen: 'base', code: null });
    expect(normalizeRoute({ screen: 'test', code: 'hab-c2' })).toMatchObject({ code: 'HAB-C2', test: 'quick' });
    expect(normalizeRoute({ screen: 'crew', code: 'HAB-C1', organ: 'heart' })).toEqual(DEFAULT_ROUTE);
  });

  it('merges within a screen and starts clean on another screen / person', () => {
    const person = normalizeRoute({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
    expect(mergeRoute(person, { organ: 'heart' })).toMatchObject({ screen: 'person', code: 'HAB-C4', organ: 'heart' });
    expect(mergeRoute(person, { code: 'HAB-C1' })).toMatchObject({ code: 'HAB-C1', organ: null });
    expect(mergeRoute(person, { screen: 'test', test: 'full' })).toMatchObject({ screen: 'test', code: 'HAB-C4', test: 'full', organ: null });
    expect(mergeRoute(person, { screen: 'base' })).toMatchObject({ screen: 'base', code: null, organ: null });
    expect(mergeRoute(person, 'crew')).toEqual(DEFAULT_ROUTE);
  });

  it('round-trips through the URL query', () => {
    const route = normalizeRoute({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
    expect(routeToSearch(route)).toBe('?screen=person&code=HAB-C4&organ=limbs');
    expect(sameRoute(routeFromSearch(routeToSearch(route)), route)).toBe(true);
    expect(routeFromSearch('')).toEqual(DEFAULT_ROUTE);
  });

  it('parent route: organ -> person -> crew; test -> person brain', () => {
    const organ = normalizeRoute({ screen: 'person', code: 'HAB-C4', organ: 'limbs' });
    expect(parentRoute(organ)).toMatchObject({ screen: 'person', organ: null });
    expect(parentRoute(parentRoute(organ))).toEqual(DEFAULT_ROUTE);
    expect(parentRoute(normalizeRoute({ screen: 'test', code: 'HAB-C2' }))).toMatchObject({ screen: 'person', code: 'HAB-C2', organ: 'brain' });
  });
});
