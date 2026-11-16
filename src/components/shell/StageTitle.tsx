// The page title block: kicker, title, one line, and the QC chip on the right.
export function StageTitle({ kicker, title, sub, right }: { kicker: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
        <span className="lbl">{kicker}</span>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="m-0 max-w-[600px] text-[13px] leading-normal text-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageBody({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`box-border flex w-full flex-col gap-5 px-6 pb-12 pt-6 max-[760px]:px-4 max-[760px]:pt-5 ${wide ? 'max-w-[1080px]' : 'max-w-[920px]'}`}>
      {children}
    </section>
  );
}

export function Loading({ error }: { error?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-[13px] text-sub">
      {error ?? 'Reading the film folder…'}
    </div>
  );
}
