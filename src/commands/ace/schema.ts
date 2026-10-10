import { Messages } from '@salesforce/core';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { z } from 'zod';
import { bodies, operations, operationFor } from '../../contracts.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'schema');

export default class Schema extends SfCommand<Record<string, unknown>> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = {
    command: Flags.string({
      summary: messages.getMessage('flags.command'),
      options: operations.map((op) => op.command),
    }),
  };

  public async run(): Promise<Record<string, unknown>> {
    const { flags } = await this.parse(Schema);
    const selected = flags.command ? [operationFor(flags.command)] : operations;
    const result = {
      operations: selected.map((op) => ({ ...op, bodySchema: op.body ? z.toJSONSchema(bodies[op.body]) : undefined })),
      note: messages.getMessage('note'),
    };
    if (!this.jsonEnabled()) this.logJson(result);
    return result;
  }
}
