export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const email = (body.email || "").trim();
    const password = (body.password || "").trim();
    const plan = (body.plan || "").trim();
    const region = (body.region || "").trim();
    const billingPeriod = (body.billingPeriod || "").trim();
    const discord = (body.discord || "").trim();
    const displayName = (body.displayName || "").trim();

    if (!email || !password || !plan || !region || !billingPeriod) {
      return Response.json(
        {
          ok: false,
          message: "Missing required fields."
        },
        { status: 400 }
      );
    }

    return Response.json({
      ok: true,
      message: "Order request received successfully.",
      data: {
        email,
        plan,
        region,
        billingPeriod,
        discord,
        displayName
      }
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "Invalid request body."
      },
      { status: 400 }
    );
  }
}