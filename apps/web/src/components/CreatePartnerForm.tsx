import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, describeError } from "../api";
import { createPartner } from "../queries";
import { buttonClass } from "./Message";

const inputClass = "rounded-md border border-line bg-page px-3 py-1.5 text-sm outline-none focus:border-accent";

export function CreatePartnerForm() {
  const queryClient = useQueryClient();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: createPartner,
    onSuccess: async () => {
      setId("");
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "partners"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ id: id.trim(), name: name.trim() });
  };

  const error =
    create.error instanceof ApiError && create.error.status === 409
      ? "Партнёр с таким id уже есть."
      : create.error instanceof ApiError && create.error.status === 400
        ? "Проверьте поля: id из латиницы, цифр и дефиса, от 2 до 31 символа; название до 100 символов."
        : create.isError
          ? describeError(create.error)
          : null;

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-card p-4">
      <h2 className="text-sm font-medium">Новый партнёр</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          id
          <input value={id} onChange={(event) => setId(event.target.value)} placeholder="delta" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Название
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Дельта Медиа" required className={inputClass} />
        </label>
        <button type="submit" disabled={create.isPending} className={buttonClass}>
          {create.isPending ? "Создаём..." : "Добавить"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        Вход в кабинет для нового партнёра настраивается в Keycloak: пользователь с ролью partner и атрибутом partner_id.
      </p>
    </form>
  );
}
