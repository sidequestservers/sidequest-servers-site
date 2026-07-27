export async function onRequestPost(context) {
  return Response.json(
    {
      ok: false,
      message: "Checkout is not available yet. No account or order was created."
    },
    { status: 410 }
  );
}
