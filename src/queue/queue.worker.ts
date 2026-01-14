async function sendWorker() {
  const job = await getNextPendingQueue();

  const response = await bpjsClient.send(job.payload);

  if (response.success) {
    await markSend(job.id);
  } else {
    await retryOrFail(job, response);
  }
}
