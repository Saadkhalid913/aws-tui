import {describe, expect, it} from 'vitest';
import {AppState, appReducer} from '../src/state/store.js';

const baseState: AppState = {
  profile: 'default',
  region: 'us-east-1',
  pageSize: 20,
  refreshSeconds: 30,
  configPath: '/tmp/config.json',
  view: 'home',
  loadingMessage: undefined,
  errorMessage: undefined,
};

describe('appReducer', () => {
  it('changes view and clears errors', () => {
    const stateWithError = {...baseState, errorMessage: 'boom'};
    const next = appReducer(stateWithError, {type: 'set-view', view: 'ec2'});

    expect(next.view).toBe('ec2');
    expect(next.errorMessage).toBeUndefined();
  });

  it('updates config fields without losing other state', () => {
    const next = appReducer(baseState, {
      type: 'set-config',
      config: {profile: 'admin', pageSize: 10},
    });

    expect(next.profile).toBe('admin');
    expect(next.pageSize).toBe(10);
    expect(next.view).toBe('home');
  });

  it('sets loading message', () => {
    const next = appReducer(baseState, {type: 'set-loading', message: 'Loading...'});
    expect(next.loadingMessage).toBe('Loading...');
  });

  it('records errors and clears loading message', () => {
    const loadingState = {...baseState, loadingMessage: 'Loading...'};
    const next = appReducer(loadingState, {type: 'set-error', message: 'Oops'});

    expect(next.errorMessage).toBe('Oops');
    expect(next.loadingMessage).toBeUndefined();
  });
});
