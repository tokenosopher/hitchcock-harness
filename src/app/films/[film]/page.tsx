import { Suspense } from 'react';
import { MainPage } from '@/components/pages/MainPage';
import { Loading } from '@/components/shell/StageTitle';

// MainPage reads ?open=<node> from the URL, which needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <MainPage />
    </Suspense>
  );
}
