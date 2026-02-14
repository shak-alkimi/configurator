import React from "react";

export default function Layout({ children, currentPageName }) {
  return (
    <div style={{ fontFamily: "'Ingram Mono', monospace" }} className="min-h-screen">
      <style>{`
        * {
          font-family: 'Ingram Mono', monospace !important;
        }
      `}</style>
      {children}
    </div>
  );
}