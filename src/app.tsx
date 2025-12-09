import React, {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {loadConfig, resolveInitialSettings, saveConfig} from './config.js';
import {AppProvider, useAppState} from './state/store.js';
import {HomeView, RegionModal} from './ui/home.js';
import {EC2View, EC2DetailPage} from './ui/ec2-view.js';
import {S3View} from './ui/s3-view.js';
import {listRegions, InstanceSummary} from './aws/ec2.js';
import {ObjectSummary} from './aws/s3.js';

export default function App() {
  const [boot, setBoot] = useState<
    | {status: 'loading'}
    | {status: 'error'; message: string}
    | {status: 'ready'; initial: Parameters<typeof AppProvider>[0]['initialState']}
  >({status: 'loading'});

  useEffect(() => {
    (async () => {
      try {
        const {config} = await loadConfig();
        const resolved = resolveInitialSettings(process.env, config);
        setBoot({
          status: 'ready',
          initial: {
            ...resolved,
            view: 'home',
            loadingMessage: undefined,
            errorMessage: undefined,
          },
        });
      } catch (error) {
        setBoot({status: 'error', message: (error as Error).message});
      }
    })();
  }, []);

  if (boot.status === 'loading') {
    return (
      <Box flexDirection="column">
        <Text>Loading config…</Text>
      </Box>
    );
  }

  if (boot.status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Failed to start: {boot.message}</Text>
      </Box>
    );
  }

  return (
    <AppProvider initialState={boot.initial}>
      <AppShell />
    </AppProvider>
  );
}

type Page =
  | {type: 'home'}
  | {type: 'ec2'}
  | {type: 's3'}
  | {type: 'ec2-detail'; instance: InstanceSummary; statusChecks?: string};

function AppShell() {
  const {state, dispatch} = useAppState();
  const [regionOpen, setRegionOpen] = useState(false);
  const [regions, setRegions] = useState<{name: string; endpoint?: string}[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionsError, setRegionsError] = useState<string>();
  const [pages, setPages] = useState<Page[]>([{type: 'home'}]);
  const [forwardStack, setForwardStack] = useState<Page[]>([]);

  const currentPage = pages[pages.length - 1];
  const [navLocked, setNavLocked] = useState(false);

  const pushPage = (page: Page) => {
    setPages((prev) => [...prev, page]);
    setForwardStack([]);
  };

  const goBack = () => {
    setPages((prev) => {
      if (prev.length <= 1) return prev;
      const nextPages = prev.slice(0, -1);
      setForwardStack((fwd) => [prev[prev.length - 1], ...fwd]);
      return nextPages;
    });
  };

  const goForward = () => {
    setForwardStack((prev) => {
      if (!prev.length) return prev;
      const [next, ...rest] = prev;
      setPages((pages) => [...pages, next]);
      return rest;
    });
  };

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      process.exit();
    }
    if (input === 'R') {
      openRegionModal();
    }
    if (!navLocked) {
      if (key.leftArrow) {
        goBack();
      }
      if (key.rightArrow) {
        goForward();
      }
    }
  });

  useEffect(() => {
    if (regionOpen && regions.length === 0 && !regionsLoading) {
      refreshRegions();
    }
  }, [regionOpen]);

  const refreshRegions = async () => {
    setRegionsLoading(true);
    setRegionsError(undefined);
    try {
      const data = await listRegions({profile: state.profile, region: state.region});
      setRegions(data);
    } catch (error) {
      setRegionsError((error as Error).message);
    } finally {
      setRegionsLoading(false);
    }
  };

  const openRegionModal = () => {
    setRegionOpen(true);
  };

  const onRegionSelected = async (region: string) => {
    dispatch({type: 'set-config', config: {region}});
    setRegionOpen(false);
    await saveConfig({
      profile: state.profile,
      region,
      pageSize: state.pageSize,
      refreshSeconds: state.refreshSeconds,
    });
  };

  const renderPage = () => {
    switch (currentPage.type) {
      case 'home':
        return (
          <HomeView
            profile={state.profile}
            region={state.region}
            errorMessage={state.errorMessage}
            onSelectService={(service) => {
              dispatch({type: 'set-view', view: service});
              pushPage({type: service});
            }}
            onOpenRegionModal={openRegionModal}
          />
        );
      case 'ec2':
        return (
          <EC2View
            profile={state.profile}
            region={state.region}
            pageSize={state.pageSize}
            onBack={goBack}
            onOpenDetail={(instance, statusChecks) =>
              pushPage({type: 'ec2-detail', instance, statusChecks})
            }
          />
        );
      case 's3':
        return (
          <S3View
            profile={state.profile}
            region={state.region}
            pageSize={state.pageSize}
            onBack={goBack}
            setNavLock={setNavLocked}
          />
        );
      case 'ec2-detail':
        return (
          <Box flexDirection="column">
            <Text color="gray">
              Use ← to go back. → reopens forward stack if available. Esc also works.
            </Text>
            <EC2DetailPage
              profile={state.profile}
              region={state.region}
              instance={currentPage.instance}
              statusChecks={currentPage.statusChecks}
              onBack={goBack}
            />
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column">
      {renderPage()}
      <RegionModal
        open={regionOpen}
        regions={regions}
        loading={regionsLoading}
        error={regionsError}
        onClose={() => setRegionOpen(false)}
        onSelect={onRegionSelected}
      />
    </Box>
  );
}
