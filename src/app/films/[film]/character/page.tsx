import { Suspense } from 'react';
import { CharactersPage } from '@/components/pages/CharactersPage';
import { Loading } from '@/components/shell/StageTitle';

// CharactersPage reads ?part=<part> from the URL, which needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CharactersPage />
    </Suspense>
  );
}
