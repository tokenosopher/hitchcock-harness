import { Suspense } from 'react';
import { ShotDetailsPage } from '@/components/shots/ShotDetailsPage';
import { Loading } from '@/components/shell/StageTitle';

// Shot details: one take at one of its shots (?shot=<n>, its place in the take), everything fed to the model for it.
// The page reads ?shot= from the URL, which needs a Suspense boundary under cacheComponents.
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ShotDetailsPage />
    </Suspense>
  );
}
