import { Messages } from '@salesforce/core';
import { AceCommand, flagsFor } from '../../../command.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@anushdsouza/sf-plugin-ace', 'ace.conversation.close');

export default class Command extends AceCommand {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly flags = flagsFor('ace conversation close');

  public async run() {
    return this.runOperation('ace conversation close');
  }
}
