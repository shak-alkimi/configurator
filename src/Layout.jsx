export default function Layout({ children, currentPageName }) {
  return (
    <div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        
        * {
          font-family: 'Space Mono', monospace !important;
        }
        
        :root {
          --primary: 149 11 16;
        }
        
        button[class*="default"],
        .bg-primary {
          background-color: #950B10 !important;
          color: white !important;
        }
        
        button[class*="default"]:hover {
          background-color: #7a0809 !important;
        }
      `}</style>
      {children}
    </div>
  );
}