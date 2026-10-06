import { useAtom } from "@effect/atom-solid";
import { Schema } from "effect";
import { createSignal } from "solid-js";
import { toast } from "somoto";
import { GraphAccessRuntime } from "../lib/graph-access/runtime";
import { SettingsRepo } from "../lib/settings/repo";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { AppForm, useAppForm } from "./ui/form";

const FormSchema = Schema.Struct({ key: Schema.NonEmptyString }).pipe(Schema.toStandardSchemaV1);

export function Root() {
  const [open, setOpen] = createSignal(false);
  const saveAtom = GraphAccessRuntime.atom.fn(SettingsRepo.setOpenAIKey);
  const [, save] = useAtom(() => saveAtom, { mode: "promise" });

  const form = useAppForm(() => ({
    defaultValues: { key: "" },
    validators: { onDynamic: FormSchema },
    async onSubmit({ value }) {
      await save(value.key).then(
        () => {
          form.reset();
          setOpen(false);
        },
        () => toast.error("Could not save the OpenAI key."),
      );
    },
  }));

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger as={Button} variant="ghost" size="sm">
        OpenAI key
      </DialogTrigger>
      <DialogPortal>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OpenAI API key</DialogTitle>
          </DialogHeader>
          <AppForm form={form} AppForm={form.AppForm} spacing="compact">
            <form.AppField name="key">
              {(field) => (
                <field.TextField
                  label="OpenAI API key"
                  type="password"
                  autocomplete="off"
                  placeholder="OpenAI API key"
                />
              )}
            </form.AppField>
            <form.SubmitButton>Save</form.SubmitButton>
          </AppForm>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

export * as OpenAIKeyModal from "./openai-key-modal";
