import { prisma } from "../server";
import { sendToBpjs } from "../bpjs/bpjs.client";

const MAX_RETRY = 5;

export async function runQueueWorker() {
  const job = await prisma.bpjsAntreanQueue.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  console.log("job", job);
  if (!job) return;

  const endpoint = job.task_id === 1 ? "/antrean/add" : "/antrean/updatewaktu";

  try {
    const response = await sendToBpjs(endpoint, job.payload);

    await prisma.bpjsAntreanLogs.create({
      data: {
        queue_id: job.id,
        request_payload: job.payload || {},
        response_payload: response.data,
        http_code: response.status,
      },
    });

    const code = response.data?.metadata?.code;

    // 200 = sukses, 208 = duplikasi
    if (code === 200 || code === 208) {
      await prisma.bpjsAntreanQueue.update({
        where: { id: job.id },
        data: {
          status: "SEND",
          sentAt: new Date(),
        },
      });
      return;
    }

    throw new Error(`BPJS responded with code ${code}`);
  } catch (error: any) {
    const retryCount = job.retry_count + 1;

    await prisma.bpjsAntreanQueue.update({
      where: { id: job.id },
      data: {
        retry_count: retryCount,
        status: retryCount >= MAX_RETRY ? "FAILED" : "PENDING",
        last_error: error.message,
      },
    });
  }
}
