export async function submitAndClearChatComposer<TAttachment>(input: {
  attachments: readonly TAttachment[];
  clearAfterSend: () => Promise<void>;
  submit: (attachments: TAttachment[]) => Promise<void>;
}) {
  const attachments = [...input.attachments];
  const submission = input.submit(attachments);
  await input.clearAfterSend();
  await submission;
}
