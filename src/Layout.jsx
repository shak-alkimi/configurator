export default function Layout({ children, currentPageName }) {
  return (
    <div>
      <style>{`
        :root {
          --primary: 149 11 16;
        }
        
        button[class*="default"],
        .bg-primary {
          background-color: #FF0000 !important;
          color: white !important;
        }
        
        button[class*="default"]:hover {
          background-color: #CC0000 !important;
        }

        /* Hide scrollbars while maintaining scrollability */
        ::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        
        ::-webkit-scrollbar-thumb {
          background: transparent;
        }
        
        /* Firefox */
        * {
          scrollbar-width: none;
        }
        
        /* IE and Edge */
        * {
          -ms-overflow-style: none;
        }
      `}</style>
      {children}
    </div>
  );
}