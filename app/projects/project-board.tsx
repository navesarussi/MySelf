"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Project, Relationship, Task } from "@/lib/types";
import { SubmitButton, inputClass } from "@/components/ui";
import { TaskForm, TaskList } from "@/app/tasks/task-board";
import { RelationshipForm, RelationshipList } from "@/app/relationships/relationship-board";
import { addProject, renameProject, deleteProject } from "./actions";

type Tab = "missions" | "connections";

export function ProjectBoard({
  projects,
  selectedProjectId,
  tab,
  tasks,
  relationships,
}: {
  projects: Project[];
  selectedProjectId?: string;
  tab: Tab;
  tasks: Task[];
  relationships: Relationship[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const selected = projects.find((p) => p.id === selectedProjectId) ?? projects[0];
  const activeTab = tab;

  function navigate(projectId: string, nextTab: Tab = activeTab) {
    router.replace(`/projects?project=${encodeURIComponent(projectId)}&tab=${nextTab}`);
  }

  const filteredTasks = selected ? tasks.filter((t) => t.project_id === selected.id) : [];
  const filteredRels = selected ? relationships.filter((r) => r.project_id === selected.id) : [];

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        <form action={addProject} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs text-muted">שם פרויקט</label>
            <input type="text" name="name" placeholder="שם הפרויקט" required className={inputClass} />
          </div>
          <SubmitButton>הוספת פרויקט</SubmitButton>
        </form>
        <p className="text-sm text-muted">אין עדיין פרויקטים. הוסף את הראשון.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              selected?.id === p.id ? "bg-accent text-bg font-medium" : "bg-border/50 text-muted hover:text-ink"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-3">
          {renaming ? (
            <form
              action={renameProject}
              className="flex flex-wrap items-center gap-2"
              onSubmit={() => setRenaming(false)}
            >
              <input type="hidden" name="id" value={selected.id} />
              <input
                type="text"
                name="name"
                defaultValue={selected.name}
                required
                className={`${inputClass} w-40`}
              />
              <SubmitButton>שמירה</SubmitButton>
              <button type="button" className="text-xs text-muted" onClick={() => setRenaming(false)}>
                ביטול
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-ink"
              >
                <Pencil size={13} /> שינוי שם
              </button>
              <form action={deleteProject}>
                <input type="hidden" name="id" value={selected.id} />
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-warn"
                >
                  <Trash2 size={13} /> מחיקת פרויקט
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <form action={addProject} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs text-muted">פרויקט חדש</label>
          <input type="text" name="name" placeholder="שם הפרויקט" required className={inputClass} />
        </div>
        <SubmitButton>הוספת פרויקט</SubmitButton>
      </form>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["missions", "משימות"],
            ["connections", "קשרים"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => selected && navigate(selected.id, id)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              activeTab === id ? "bg-accent text-bg font-medium" : "bg-border/50 text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selected && activeTab === "missions" && (
        <>
          <TaskForm projects={projects} fixedProjectId={selected.id} />
          <TaskList tasks={filteredTasks} showProjectBadge={false} />
        </>
      )}

      {selected && activeTab === "connections" && (
        <>
          <RelationshipForm projects={projects} fixedProjectId={selected.id} />
          <RelationshipList relationships={filteredRels} showProjectBadge={false} />
        </>
      )}
    </div>
  );
}
