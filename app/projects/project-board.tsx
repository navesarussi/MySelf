"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Project, Relationship, Task } from "@/lib/types";
import { useTranslations } from "@/components/locale-provider";
import { SubmitButton, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { TaskForm, TaskList } from "@/app/tasks/task-board";
import { RelationshipForm, RelationshipList } from "@/app/relationships/relationship-board";
import { addProject, renameProject, deleteProject } from "./actions";

type Tab = "missions" | "connections";

function ProjectAddForm({
  defaultOpen,
  labelKey,
  inputLabelKey,
}: {
  defaultOpen: boolean;
  labelKey: "projects.addProject";
  inputLabelKey: "projects.projectName" | "projects.newProject";
}) {
  const { t } = useTranslations();

  return (
    <AddFormToggle
      label={t(labelKey)}
      defaultOpen={defaultOpen}
      className="mt-6"
      id="add-form-project"
    >
      <form action={addProject} className="card flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs text-muted">{t(inputLabelKey)}</label>
          <input
            type="text"
            name="name"
            placeholder={t("projects.projectNamePlaceholder")}
            required
            className={inputClass}
          />
        </div>
        <SubmitButton>{t(labelKey)}</SubmitButton>
      </form>
    </AddFormToggle>
  );
}

export function ProjectBoard({
  projects,
  selectedProjectId,
  tab,
  tasks,
  relationships,
  addTarget,
}: {
  projects: Project[];
  selectedProjectId?: string;
  tab: Tab;
  tasks: Task[];
  relationships: Relationship[];
  addTarget?: string;
}) {
  const { t } = useTranslations();
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
        <p className="text-sm text-muted">{t("projects.noProjects")}</p>
        <ProjectAddForm
          defaultOpen={addTarget === "project"}
          labelKey="projects.addProject"
          inputLabelKey="projects.projectName"
        />
      </div>
    );
  }

  const showMissions = activeTab === "missions";
  const showConnections = activeTab === "connections";

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
        {selected && !renaming && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="p-1.5 text-muted hover:text-ink"
              title={t("projects.rename")}
            >
              <Pencil size={14} />
            </button>
            <form action={deleteProject}>
              <input type="hidden" name="id" value={selected.id} />
              <button
                type="submit"
                className="p-1.5 text-muted hover:text-warn"
                title={t("projects.deleteProject")}
              >
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        )}
      </div>

      {selected && renaming && (
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
          <SubmitButton>{t("common.save")}</SubmitButton>
          <button type="button" className="text-xs text-muted" onClick={() => setRenaming(false)}>
            {t("common.cancel")}
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2 md:hidden">
        {(
          [
            ["missions", t("projects.tabMissions")],
            ["connections", t("projects.tabConnections")],
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

      {selected && (
        <div className="md:grid md:grid-cols-2 md:gap-6">
          <section className={showMissions ? "block" : "hidden md:block"}>
            <h2 className="mb-3 hidden text-sm font-medium text-muted md:block">
              {t("projects.tabMissions")}
            </h2>
            <TaskList
              tasks={filteredTasks}
              projects={projects}
              showProjectBadge={false}
              showProjectSelect={false}
            />
            <TaskForm
              projects={projects}
              fixedProjectId={selected.id}
              defaultOpen={addTarget === "task"}
            />
          </section>

          <section className={showConnections ? "block" : "hidden md:block"}>
            <h2 className="mb-3 hidden text-sm font-medium text-muted md:block">
              {t("projects.tabConnections")}
            </h2>
            <RelationshipList
              relationships={filteredRels}
              projects={projects}
              showProjectBadge={false}
              showProjectSelect={false}
            />
            <RelationshipForm
              projects={projects}
              fixedProjectId={selected.id}
              defaultOpen={addTarget === "contact"}
              className="mt-6"
            />
          </section>
        </div>
      )}

      <ProjectAddForm
        defaultOpen={addTarget === "project"}
        labelKey="projects.addProject"
        inputLabelKey="projects.newProject"
      />
    </div>
  );
}
