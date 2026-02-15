import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calculator, FileText, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const [userOrg, setUserOrg] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const user = await base44.auth.me();
      setUserInfo(user);
      if (user?.organization_id) {
        setUserOrg(user.organization_id);
      }
    };
    fetchUser();
  }, []);

  const { data: approvedProjects = [] } = useQuery({
    queryKey: ['approvedProjects', userOrg],
    queryFn: () => userOrg ? base44.entities.Project.filter({ organization_id: userOrg, status: 'approved' }, '-updated_date', 5) : [],
    enabled: !!userOrg,
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="flex items-center py-6 pr-6 pl-0">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/f2bc037c5_Screenshot2026-02-14160229.png" 
            alt="ALKIMI Logo"
            className="h-12"
            style={{ filter: 'invert(1)' }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Calculator Card */}
          <Link to={createPageUrl('Calculator')}>
            <Card className="h-full bg-slate-50 border-slate-200 hover:border-slate-300 transition-all cursor-pointer hover:shadow-lg">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full gap-4">
                <Calculator className="h-3 w-3 text-black" />
                <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Quotations</h2>
                   <p className="text-slate-600 text-sm">Create and manage quotes</p>
                  </div>
                  <Button size="sm" className="mt-2 gap-2 text-xs h-8 hover:opacity-90" style={{ backgroundColor: '#e9ff64', color: '#000' }}>
                   Open
                   <ArrowRight className="h-4 w-4" />
                  </Button>
              </CardContent>
            </Card>
          </Link>

          {/* Projects Card */}
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full gap-4">
              <FileText className="h-3 w-3 text-black" />
              <div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Projects</h2>
                  <p className="text-slate-600 text-sm">View details for approved projects</p>
                </div>
              <Link to={createPageUrl('Calculator')}>
                <Button size="sm" className="mt-2 gap-2 text-xs h-8 hover:opacity-90" style={{ backgroundColor: '#e9ff64', color: '#000' }}>
                   Open
                   <ArrowRight className="h-4 w-4" />
                 </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Approved Projects List */}
        {approvedProjects.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Approved Projects</h2>
            <div className="grid gap-4">
              {approvedProjects.map((project) => (
                <Link key={project.id} to={createPageUrl('ProjectDetail') + '?id=' + project.id}>
                  <Card className="bg-slate-50 border-slate-200 hover:border-slate-300 transition-all cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{project.project_name}</h3>
                          <p className="text-slate-500 text-sm mt-1">{project.customer_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-slate-900">
                            ${project.total_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || 'N/A'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {format(new Date(project.updated_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}