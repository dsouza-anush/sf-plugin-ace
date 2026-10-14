import { Messages } from '@salesforce/core';
import { AceCommand, flagsFor } from '../../../command.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'ace.entry.add');

export default class EntryAdd extends AceCommand {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = flagsFor('ace entry add');

  public async run() {
    return this.runOperation('ace entry add');
  }
}
