import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

import { UserPlus, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function InviteUsers() {
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const queryClient = useQueryClient();

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      const user = await base44.auth.me();
      setIsAdmin(user?.role === 'admin');
    };
    checkAdmin();
  }, []);



  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async ({ email, orgName }) => {
      await base44.users.inviteUser(email, 'user');
      // Store the pending organization assignment
      await base44.entities.UserInvitation.create({
        email,
        organization_name: orgName,
        invited_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Invitation sent successfully');
      setEmail('');
      setOrganizationName('');
    },
    onError: (error) => {
      toast.error('Failed to send invitation: ' + error.message);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!email || !organizationName) {
      toast.error('Please fill in all fields');
      return;
    }

    inviteMutation.mutate({ 
      email, 
      orgName: organizationName
    });
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Access denied. Admin privileges required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white flex-shrink-0">
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
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="max-w-2xl mx-auto p-6">
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization Name</Label>
                <Input
                  id="organization"
                  type="text"
                  placeholder="Enter organization name"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                style={{ backgroundColor: '#e9ff64', color: '#000' }}
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}