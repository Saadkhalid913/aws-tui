import React, {createContext, useContext, useReducer} from 'react';
import {AppConfig} from '../config.js';

export type ServiceView = 'home' | 'ec2' | 's3' | 'costs';

export type AppState = AppConfig & {
  configPath: string;
  view: ServiceView;
  loadingMessage?: string;
  errorMessage?: string;
};

export type AppAction =
  | {type: 'set-view'; view: ServiceView}
  | {type: 'set-config'; config: Partial<AppConfig>}
  | {type: 'set-loading'; message?: string}
  | {type: 'set-error'; message?: string};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'set-view':
      return {...state, view: action.view, errorMessage: undefined};
    case 'set-config':
      return {...state, ...action.config};
    case 'set-loading':
      return {...state, loadingMessage: action.message};
    case 'set-error':
      return {...state, errorMessage: action.message, loadingMessage: undefined};
    default:
      return state;
  }
}

export function AppProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState: AppState;
}) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return <AppContext.Provider value={{state, dispatch}}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used inside AppProvider');
  }
  return ctx;
}
