'use client';
// "/" opens the first film in progress.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFilms } from '@/components/data/films';

export default function Home() {
  const { films, error, loaded } = useFilms();
  const router = useRouter();
  const first = films.find((f) => f.status === 'in-progress') ?? films[0];
  useEffect(() => { if (first) router.replace(`/films/${first.slug}`); }, [first, router]);
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-sub">
      {error ?? (loaded && !first ? 'No films found' : 'Opening the film in progress…')}
    </div>
  );
}
