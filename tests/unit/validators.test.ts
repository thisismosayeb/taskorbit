import { describe, expect, it } from "vitest";
import {
  commentSchema,
  inviteSchema,
  projectSchema,
  signupSchema,
  subtaskSchema,
  taskSchema,
} from "@/lib/validators";

const validTask = {
  title: "Build the login page",
  description: "Wire up Supabase Auth.",
  priority: "high" as const,
  status: "todo" as const,
  start_date: "2026-11-10",
  due_date: "2026-11-12",
  assigned_to: "11111111-1111-4111-8111-111111111111",
};

describe("taskSchema", () => {
  it("rejects an empty title", () => {
    expect(taskSchema.safeParse({ ...validTask, title: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    expect(taskSchema.safeParse({ ...validTask, title: "   " }).success).toBe(
      false,
    );
  });

  it("trims the title on success", () => {
    const r = taskSchema.safeParse({ ...validTask, title: "  Fix bug  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Fix bug");
  });

  it("rejects a title over 200 characters", () => {
    expect(
      taskSchema.safeParse({ ...validTask, title: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects a description over 2000 characters", () => {
    expect(
      taskSchema.safeParse({ ...validTask, description: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });

  it("rejects a due date before the start date", () => {
    const r = taskSchema.safeParse({
      ...validTask,
      start_date: "2026-11-12",
      due_date: "2026-11-10",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "Due date must be on or after the start date",
      );
    }
  });

  it("accepts a due date equal to the start date", () => {
    const r = taskSchema.safeParse({
      ...validTask,
      start_date: "2026-11-12",
      due_date: "2026-11-12",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid task", () => {
    expect(taskSchema.safeParse(validTask).success).toBe(true);
  });

  it("accepts a task with no dates and no assignee", () => {
    const { start_date, due_date, assigned_to, ...rest } = validTask;
    expect(taskSchema.safeParse(rest).success).toBe(true);
  });
});

describe("subtaskSchema", () => {
  it("rejects a whitespace-only title", () => {
    const { assigned_to, ...subtask } = validTask;
    expect(subtaskSchema.safeParse({ ...subtask, title: "  " }).success).toBe(
      false,
    );
  });

  it("rejects a due date before the start date", () => {
    const { assigned_to, ...subtask } = validTask;
    expect(
      subtaskSchema.safeParse({
        ...subtask,
        start_date: "2026-11-12",
        due_date: "2026-11-10",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid subtask and has no assignee field", () => {
    const { assigned_to, ...subtask } = validTask;
    const r = subtaskSchema.safeParse(subtask);
    expect(r.success).toBe(true);
    if (r.success) expect("assigned_to" in r.data).toBe(false);
  });
});

describe("projectSchema", () => {
  const validProject = {
    name: "TaskOrbit",
    description: "Lab project",
    status: "active" as const,
    priority: "medium" as const,
    start_date: "2026-11-01",
    due_date: "2026-12-01",
  };

  it("rejects a due date before the start date", () => {
    expect(
      projectSchema.safeParse({
        ...validProject,
        start_date: "2026-12-01",
        due_date: "2026-11-01",
      }).success,
    ).toBe(false);
  });

  it("rejects a name over 100 characters", () => {
    expect(
      projectSchema.safeParse({ ...validProject, name: "x".repeat(101) })
        .success,
    ).toBe(false);
  });

  it("accepts a valid project", () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true);
  });
});

describe("commentSchema", () => {
  it("rejects empty and whitespace-only content", () => {
    expect(commentSchema.safeParse({ content: "" }).success).toBe(false);
    expect(commentSchema.safeParse({ content: "   " }).success).toBe(false);
  });

  it("rejects 2001 characters", () => {
    expect(commentSchema.safeParse({ content: "x".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("accepts exactly 2000 characters", () => {
    expect(commentSchema.safeParse({ content: "x".repeat(2000) }).success).toBe(
      true,
    );
  });

  it("trims content", () => {
    const r = commentSchema.safeParse({ content: "  Hello  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.content).toBe("Hello");
  });
});

describe("signupSchema", () => {
  const valid = {
    full_name: "Mosayeb Siam",
    email: "mosayeb@example.com",
    password: "secret123",
    confirm_password: "secret123",
  };

  it("accepts a valid signup", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      signupSchema.safeParse({
        ...valid,
        password: "abc123",
        confirm_password: "abc123",
      }).success,
    ).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    expect(
      signupSchema.safeParse({ ...valid, confirm_password: "secret124" })
        .success,
    ).toBe(false);
  });
});

describe("inviteSchema", () => {
  it("lowercases the email", () => {
    const r = inviteSchema.safeParse({ email: "DEV@Example.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("dev@example.com");
  });

  it("rejects an invalid email", () => {
    expect(inviteSchema.safeParse({ email: "not-an-email" }).success).toBe(
      false,
    );
  });
});
