import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GitBranch, Copy, RotateCcw, Eye, Trash2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VersionManager({
  versions,
  onCreateVersion,
  onRevertVersion,
  onDeleteVersion,
  onViewVersion,
  projectName,
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [versionNotes, setVersionNotes] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState(null);

  const handleCreate = async () => {
    await onCreateVersion(versionNotes);
    setVersionNotes("");
    setShowCreateDialog(false);
  };

  const handleRevert = async (versionId) => {
    await onRevertVersion(versionId);
    setSelectedVersionId(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-slate-600" />
            <CardTitle>Quote Versions</CardTitle>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-4 w-4 mr-1" />
                Create Version
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Version</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-3">
                    Save a snapshot of the current quote
                  </p>
                  <Label htmlFor="notes" className="text-xs">
                    Version Notes (optional)
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="e.g., Updated with customer feedback..."
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    className="h-20 mt-1"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreate}>Create Version</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {versions.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">
            No versions yet. Create one to track changes.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      v{version.version_number}
                    </span>
                    {index === 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(version.created_date).toLocaleDateString()} at{" "}
                    {new Date(version.created_date).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {version.notes && (
                    <p className="text-xs text-slate-600 mt-1 truncate">
                      {version.notes}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    ${version.total_price?.toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  {index !== 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-600"
                          title="Revert to this version"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revert to Version?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore the project and tape runs from
                            version {version.version_number}. Current changes
                            will be lost unless you create a version first.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex gap-3 justify-end">
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRevert(version.id)}
                          >
                            Revert
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                    onClick={() => onViewVersion(version)}
                    title="View version details"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  {index !== 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                          title="Delete version"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Version?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This version will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex gap-3 justify-end">
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteVersion(version.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}