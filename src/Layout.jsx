import React from "react";

export default function Layout({ children, currentPageName }) {
  return (
    <div style={{ fontFamily: "'Ingram Mono', monospace" }} className="min-h-screen">
      <style>{`
        * {
          font-family: 'Ingram Mono', monospace !important;
        }
        body::-webkit-scrollbar {
          display: none;
        }
        body {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      {children}
    </div>
  );
}