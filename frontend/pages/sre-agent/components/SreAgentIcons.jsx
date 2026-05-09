import { memo } from "react";

export const RobotIcon = memo(function RobotIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="5" y="6" width="14" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 14.5h5" />
    </svg>
  );
});

export const SkillIcon = memo(function SkillIcon({ name }) {
  const cls = "h-8 w-8 rounded-lg bg-primary/10 p-1.5 text-primary dark:bg-primary/20 shrink-0";
  switch (name) {
    case "server":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 17.25v-2.625a1.125 1.125 0 00-1.125-1.125h-18a1.125 1.125 0 00-1.125 1.125v2.625m19.5 0h-19.5m19.5 0v2.625a1.125 1.125 0 01-1.125 1.125h-18a1.125 1.125 0 01-1.125-1.125v-2.625m19.5 0h-19.5M6 12h.008v.008H6V12zm0 3h.008v.008H6V15zm0 3h.008v.008H6V18zm3-6h.008v.008H9V12zm0 3h.008v.008H9V15zm0 3h.008v.008H9V18zm3-6h.008v.008h-.008V12zm0 3h.008v.008h-.008V15zm0 3h.008v.008h-.008V18z"
            />
          </svg>
        </div>
      );
    case "container":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 6.878V6h12v.878M6 8.25h12m-12 3h12m-12 3h12m-12 3h12m-12 3h12M6 21h12a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12.75A2.25 2.25 0 006 21z"
            />
          </svg>
        </div>
      );
    case "app":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
        </div>
      );
    case "cube":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
      );
    case "chart":
    case "bar-chart":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
      );
    case "bug":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-3.83-7.44M12 12.75c-2.883 0-5.647.508-8.208 1.44a23.91 23.91 0 003.832-7.44" />
          </svg>
        </div>
      );
    case "doc":
      return (
        <div className={cls}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
});
