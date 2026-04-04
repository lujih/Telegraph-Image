import * as Sentry from "@sentry/cloudflare";

export async function errorHandling(context) {
  const env = context.env;
  if (!env.disable_telemetry) {
    context.data.telemetry = true;
    let remoteSampleRate = 0.001;
    try {
      const sampleRate = await fetchSampleRate(context)
      console.log("sampleRate", sampleRate);
      if (sampleRate) {
        remoteSampleRate = sampleRate;
      }
    } catch (e) { console.log(e) }
    const sampleRate = env.sampleRate || remoteSampleRate;
    console.log("sampleRate", sampleRate);

    return Sentry.sentryPagesPlugin({
      dsn: "https://219f636ac7bde5edab2c3e16885cb535@o4507041519108096.ingest.us.sentry.io/4507541492727808",
      tracesSampleRate: sampleRate,
    })(context);
  }
  return context.next();
}

export function telemetryData(context) {
  const env = context.env;
  if (!env.disable_telemetry) {
    try {
      const parsedHeaders = {};
      const safeHeaders = ['user-agent', 'accept', 'content-type', 'referer', 'accept-language', 'accept-encoding', 'connection'];
      context.request.headers.forEach((value, key) => {
        if (safeHeaders.includes(key.toLowerCase())) {
          parsedHeaders[key] = value;
          if (value.length > 0) {
            context.data.sentry.setTag(key, value);
          }
        }
      });
      const CF = JSON.parse(JSON.stringify(context.request.cf));
      const parsedCF = {};
      for (const key in CF) {
        if (key === 'clientTcpRtt' || key === 'colo' || key === 'httpProtocol' || key === 'requestPriority' || key === 'tlsCipher' || key === 'tlsVersion' || key === 'asn' || key === 'country') {
          parsedCF[key] = CF[key];
          if (CF[key] && typeof CF[key] !== 'object' && CF[key].length > 0) {
            context.data.sentry.setTag(key, CF[key]);
          }
        } else if (typeof CF[key] === 'object') {
          parsedCF[key] = JSON.stringify(CF[key]);
        }
      }
      const data = {
        headers: parsedHeaders,
        cf: parsedCF,
        url: context.request.url,
        method: context.request.method,
        redirect: context.request.redirect,
      }
      const urlPath = new URL(context.request.url).pathname;
      const hostname = new URL(context.request.url).hostname;
      context.data.sentry.setTag("path", urlPath);
      context.data.sentry.setTag("url", data.url);
      context.data.sentry.setTag("method", context.request.method);
      context.data.sentry.setTag("redirect", context.request.redirect);
      context.data.sentry.setContext("request", data);
      const transaction = context.data.sentry.startTransaction({ name: `${context.request.method} ${hostname}` });
      context.data.transaction = transaction;
      return context.next();
    } catch (e) {
      console.log(e);
    } finally {
      context.data.transaction.finish();
    }
  }
  return context.next();
}

export async function traceData(context, span, op, name) {
  const data = context.data
  if (data.telemetry) {
    if (span) {
      console.log("span finish")
      span.finish();
    } else {
      console.log("span start")
      span = await context.data.transaction.startChild(
        { op: op, name: name },
      );
    }
  }
}

async function fetchSampleRate(context) {
  const data = context.data
  if (data.telemetry) {
    const url = "https://frozen-sentinel.pages.dev/signal/sampleRate.json";
    const response = await fetch(url);
    const json = await response.json();
    return json.rate;
  }
}