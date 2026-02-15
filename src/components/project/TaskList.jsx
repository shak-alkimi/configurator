import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function TaskList({ projectId, tasks, users }) {
  const [newTask, setNewTask] = useState({
    task_name: '',
    description: '',
    assigned_to: '',
    deadline: '',
    priority: 'medium',
    status: 'todo'
  });

  const queryClient = useQueryClient();

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => base44.entities.Task.create(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setNewTask({
        task_name: '',
        description: '',
        assigned_to: '',
        deadline: '',
        priority: 'medium',
        status: 'todo'
      });
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id) => base44.entities.Task.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    }
  });

  const handleAdd = () => {
    if (newTask.task_name) {
      createTaskMutation.mutate({ ...newTask, project_id: projectId });
    }
  };

  const statusIcons = {
    todo: <Clock className="w-4 h-4 text-slate-400" />,
    in_progress: <AlertCircle className="w-4 h-4 text-blue-500" />,
    completed: <CheckCircle2 className="w-4 h-4 text-green-500" />
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800"
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tasks</h3>
        <span className="text-sm text-slate-500">
          {tasks.filter(t => t.status === 'completed').length} / {tasks.length} completed
        </span>
      </div>

      {/* Add New Task */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Task Name</Label>
              <Input
                value={newTask.task_name}
                onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })}
                placeholder="Task name"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assign To</Label>
              <Select
                value={newTask.assigned_to}
                onValueChange={(value) => setNewTask({ ...newTask, assigned_to: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.email}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select
                value={newTask.priority}
                onValueChange={(value) => setNewTask({ ...newTask, priority: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Deadline</Label>
              <Input
                type="date"
                value={newTask.deadline}
                onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="col-span-2">
              <Button onClick={handleAdd} size="sm" className="w-full h-9 hover:opacity-90" style={{ backgroundColor: '#e9ff64', color: '#000' }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Tasks */}
      <div className="space-y-2">
        {tasks.map((task) => (
          <Card key={task.id} className={task.status === 'completed' ? 'opacity-60' : ''}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={task.status}
                      onValueChange={(value) => updateTaskMutation.mutate({ id: task.id, data: { status: value } })}
                    >
                      <SelectTrigger className="h-7 w-32">
                        <div className="flex items-center gap-2">
                          {statusIcons[task.status]}
                          <span className="text-xs">{task.status.replace('_', ' ')}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <h4 className={`font-medium ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>
                      {task.task_name}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={priorityColors[task.priority]}>
                      {task.priority}
                    </Badge>
                    {task.assigned_to && (
                      <Badge variant="outline">
                        {users.find(u => u.email === task.assigned_to)?.full_name || task.assigned_to}
                      </Badge>
                    )}
                    {task.deadline && (
                      <Badge variant="outline">
                        Due: {format(new Date(task.deadline), 'MMM d')}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-slate-600">{task.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTaskMutation.mutate(task.id)}
                  className="h-8 w-8 text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}