import { TagRepo } from "./tag.repo";
import { nanoid } from "nanoid";

export namespace TagService {
  export async function create({ name }: { name: string }) {
    const id = nanoid();
    return await TagRepo.create({ id, name: name.trim() });
  }

  export async function search({ name }: { name: string }) {
    return await TagRepo.search({ name: name });
  }
}
