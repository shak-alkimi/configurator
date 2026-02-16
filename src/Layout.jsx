export default function Layout({ children, currentPageName }) {
  return (
    <div>
      <style>{`
        [class*="bg-primary"],
        [class*="bg-slate"],
        button {
          --button-color: #950B10;
        }
        
        button,
        [role="button"] {
          background-color: #950B10;
          color: white;
        }
        
        button:hover,
        [role="button"]:hover {
          background-color: #7a0809;
        }
        
        button:disabled {
          background-color: #cccccc;
        }
      `}</style>
      {children}
    </div>
  );
}