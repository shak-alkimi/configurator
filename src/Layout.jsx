export default function Layout({ children, currentPageName }) {
  return (
    <div>
      <style>{`
        :root {
          --primary: 149 11 16;
        }
        
        button[class*="default"],
        .bg-primary {
          background-color: #e9ff64 !important;
          color: black !important;
        }
        
        button[class*="default"]:hover {
          background-color: #d4e64d !important;
        }
      `}</style>
      {children}
    </div>
  );
}