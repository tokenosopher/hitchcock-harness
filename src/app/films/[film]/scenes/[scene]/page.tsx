import { Suspense } from 'react';
import { ScenePage } from '@/components/pages/ScenePage';
import { Loading } from '@/components/shell/StageTitle';

// ScenePage reads ?take=<id> from the URL (the take a tile on the Scenes page named), which needs a Suspense
// boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ScenePage />
    </Suspense>
  );
}
