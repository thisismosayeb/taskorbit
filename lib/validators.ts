// Zod input schemas (Part 1) — now locale-aware (Part 3, §7).
//
// Every schema is built by a `build*Schema(tr)` function that takes a
// translator. The exported constants (`loginSchema`, …) are built once
// with the default translator — English, exactly as before — so server
// actions and the existing unit tests are untouched. Client forms use
// the `*SchemaFor(locale)` factories with the current locale (via
// `useLocale()` + `useMemo`) so validation messages translate the
// instant the language switches, without rebuilding the form: the
// resolver is recreated, react-hook-form keeps the field values.
//
// A schema built for one locale is immutable — switching locale builds
// a fresh schema; nothing is mutated in place.

import { z } from "zod";
import { createTranslator, t, type SupportedLocale } from "@/lib/i18n/dictionary";

type Translator = (key: string, params?: Record<string, string | number | null | undefined>) => string;

function dateStringFor(tr: Translator) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, tr("validators.invalidDate"));
}

/** Shared refine: due date must be on or after the start date. */
function dueAfterStartFor<T extends { start_date?: string | null; due_date?: string | null }>(
  schema: z.ZodType<T>,
  tr: Translator,
) {
  return schema.refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    message: tr("validators.dueBeforeStart"),
    path: ["due_date"],
  });
}

function buildSignupSchema(tr: Translator) {
  return z
    .object({
      full_name: z.string().trim().min(2, tr("validators.nameMin")),
      email: z.string().trim().toLowerCase().email(tr("validators.invalidEmail")),
      // Strength hint: at least 8 characters, with a letter and a number.
      password: z
        .string()
        .min(8, tr("validators.passwordMin"))
        .regex(/[A-Za-z]/, tr("validators.passwordLetter"))
        .regex(/[0-9]/, tr("validators.passwordNumber")),
      confirm_password: z.string(),
    })
    .refine((v) => v.password === v.confirm_password, {
      message: tr("auth.passwordsDoNotMatch"),
      path: ["confirm_password"],
    });
}

function buildLoginSchema(tr: Translator) {
  return z.object({
    email: z.string().trim().toLowerCase().email(tr("validators.invalidEmail")),
    password: z.string().min(1, tr("validators.passwordRequired")),
  });
}

function buildForgotPasswordSchema(tr: Translator) {
  return z.object({
    email: z.string().trim().toLowerCase().email(tr("validators.invalidEmail")),
  });
}

function buildResetPasswordSchema(tr: Translator) {
  return z
    .object({
      password: z
        .string()
        .min(8, tr("validators.passwordMin"))
        .regex(/[A-Za-z]/, tr("validators.passwordLetter"))
        .regex(/[0-9]/, tr("validators.passwordNumber")),
      confirm_password: z.string(),
    })
    .refine((v) => v.password === v.confirm_password, {
      message: tr("auth.passwordsDoNotMatch"),
      path: ["confirm_password"],
    });
}

function buildWorkspaceSchema(tr: Translator) {
  return z.object({
    name: z.string().trim().min(2, tr("validators.workspaceNameMin")).max(80),
    timezone: z.string().min(1, tr("validators.timezoneRequired")).default("Asia/Dhaka"),
  });
}

function buildProjectSchema(tr: Translator) {
  const optionalDate = dateStringFor(tr).optional().nullable();
  return dueAfterStartFor(
    z.object({
      name: z.string().trim().min(1, tr("validators.projectNameRequired")).max(100),
      description: z.string().trim().max(1000).optional().nullable(),
      status: z.enum(["planning", "active", "on_hold", "completed", "archived"]),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      start_date: optionalDate,
      due_date: optionalDate,
    }),
    tr,
  );
}

function buildTaskSchema(tr: Translator) {
  const optionalDate = dateStringFor(tr).optional().nullable();
  return dueAfterStartFor(
    z.object({
      title: z.string().trim().min(1, tr("validators.titleRequired")).max(200),
      description: z.string().trim().max(2000).optional().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      status: z.enum(["todo", "in_progress", "in_review", "completed"]),
      start_date: optionalDate,
      due_date: optionalDate,
      assigned_to: z.string().uuid(tr("validators.chooseMember")).nullable().optional(),
    }),
    tr,
  );
}

function buildSubtaskSchema(tr: Translator) {
  // Subtasks never carry their own assignee: it is copied from the parent.
  // Build from the task schema's shape minus assigned_to.
  const optionalDate = dateStringFor(tr).optional().nullable();
  return dueAfterStartFor(
    z.object({
      title: z.string().trim().min(1, tr("validators.titleRequired")).max(200),
      description: z.string().trim().max(2000).optional().nullable(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      status: z.enum(["todo", "in_progress", "in_review", "completed"]),
      start_date: optionalDate,
      due_date: optionalDate,
    }),
    tr,
  );
}

function buildCommentSchema(tr: Translator) {
  return z.object({
    content: z.string().trim().min(1, tr("validators.commentEmpty")).max(2000, tr("validators.commentTooLong")),
  });
}

function buildInviteSchema(tr: Translator) {
  return z.object({
    email: z.string().trim().toLowerCase().email(tr("validators.invalidEmail")),
  });
}

// English constants (import-time, as before) — server actions and tests.
export const signupSchema = buildSignupSchema(t);
export const loginSchema = buildLoginSchema(t);
export const forgotPasswordSchema = buildForgotPasswordSchema(t);
export const resetPasswordSchema = buildResetPasswordSchema(t);
export const workspaceSchema = buildWorkspaceSchema(t);
export const projectSchema = buildProjectSchema(t);
export const taskSchema = buildTaskSchema(t);
export const subtaskSchema = buildSubtaskSchema(t);
export const commentSchema = buildCommentSchema(t);
export const inviteSchema = buildInviteSchema(t);

// Locale-aware factories for client forms.
export function signupSchemaFor(locale: SupportedLocale) {
  return buildSignupSchema(createTranslator(locale));
}
export function loginSchemaFor(locale: SupportedLocale) {
  return buildLoginSchema(createTranslator(locale));
}
export function forgotPasswordSchemaFor(locale: SupportedLocale) {
  return buildForgotPasswordSchema(createTranslator(locale));
}
export function resetPasswordSchemaFor(locale: SupportedLocale) {
  return buildResetPasswordSchema(createTranslator(locale));
}
export function workspaceSchemaFor(locale: SupportedLocale) {
  return buildWorkspaceSchema(createTranslator(locale));
}
export function projectSchemaFor(locale: SupportedLocale) {
  return buildProjectSchema(createTranslator(locale));
}
export function taskSchemaFor(locale: SupportedLocale) {
  return buildTaskSchema(createTranslator(locale));
}
export function subtaskSchemaFor(locale: SupportedLocale) {
  return buildSubtaskSchema(createTranslator(locale));
}
export function commentSchemaFor(locale: SupportedLocale) {
  return buildCommentSchema(createTranslator(locale));
}
export function inviteSchemaFor(locale: SupportedLocale) {
  return buildInviteSchema(createTranslator(locale));
}

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type WorkspaceInput = z.infer<typeof workspaceSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type SubtaskInput = z.infer<typeof subtaskSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
