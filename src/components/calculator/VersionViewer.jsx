import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

export default function VersionViewer({ version, isOpen, onClose }) {
  if (!version) return null;

  const project = version.project_snapshot;
  const tapeRuns = version.tape_runs_snapshot || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version {version.version_number} Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project Details */}
          <div>
            <h4 className="font-semibold text-sm mb-2 text-slate-700">
              Project Details
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg">
              <div>
                <span className="text-slate-500">Project Name:</span>
                <p className="font-medium">{project.project_name}</p>
              </div>
              <div>
                <span className="text-slate-500">Customer:</span>
                <p className="font-medium">{project.customer_name}</p>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>
                <p className="font-medium">{project.customer_email || "—"}</p>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <p className="font-medium">
                  <Badge
                    variant={
                      project.status === "approved"
                        ? "default"
                        : project.status === "submitted"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {project.status}
                  </Badge>
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Location:</span>
                <p className="font-medium">
                  {project.street && `${project.street}, `}
                  {project.city && `${project.city}, `}
                  {project.state}
                </p>
              </div>
            </div>
          </div>

          {/* Tape Runs */}
          <div>
            <h4 className="font-semibold text-sm mb-2 text-slate-700">
              Tape Runs ({tapeRuns.length})
            </h4>
            {tapeRuns.length === 0 ? (
              <p className="text-xs text-slate-500">No tape runs</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tapeRuns.map((run, idx) => (
                  <div
                    key={idx}
                    className="text-xs bg-slate-50 p-2 rounded border border-slate-200"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500">Type:</span>
                        <p className="font-medium">{run.run_name || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Length:</span>
                        <p className="font-medium">
                          {Math.floor(run.length_feet)}'{" "}
                          {Math.round((run.length_feet % 1) * 12)}"
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Output:</span>
                        <p className="font-medium">{run.tape_type}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">CCT:</span>
                        <p className="font-medium">{run.cct}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">Housing:</span>
                        <p className="font-medium">{run.channel_type}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-600">Total Price:</span>
                <p className="font-bold text-lg">
                  ${version.total_price?.toLocaleString()}
                </p>
              </div>
              <div className="text-right text-slate-500">
                <p>
                  {new Date(version.created_date).toLocaleDateString()}{" "}
                  {new Date(version.created_date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>

          {version.notes && (
            <div className="bg-slate-100 rounded-lg p-3 text-xs">
              <span className="text-slate-600">Notes:</span>
              <p className="mt-1">{version.notes}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}