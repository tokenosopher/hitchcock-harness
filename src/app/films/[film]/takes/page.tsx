import { Suspense } from 'react';
import { TakesInboxPage } from '@/components/takes/TakesInboxPage';
import { Loading } from '@/components/shell/StageTitle';

// New takes: reads ?take= and ?all= from the URL, which needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TakesInboxPage />
    </Suspense>
  );
}
