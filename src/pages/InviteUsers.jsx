import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

import { UserPlus, Mail, Send } from 'lucide-react';
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
    <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="max-w-2xl mx-auto p-6">
          <Card className="bg-slate-50">
          <CardHeader className="pb-4">
            <CardTitle className="pl-0">
              Invite New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  id="email"
                  type="email"
                  placeholder="user@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Input
                  id="organization"
                  type="text"
                  placeholder="organization"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="bg-white"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                style={{ backgroundColor: '#e9ff64', color: '#000' }}
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? 'Sending...' : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
          </Card>
          </div>
          </div>
  );
}