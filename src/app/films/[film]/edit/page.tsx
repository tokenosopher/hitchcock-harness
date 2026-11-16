import { Suspense } from 'react';
import { EditPage } from '@/components/edit/EditPage';
import { Loading } from '@/components/shell/StageTitle';

// EditPage reads ?at=<frame> from the URL, which needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EditPage />
    </Suspense>
  );
}
