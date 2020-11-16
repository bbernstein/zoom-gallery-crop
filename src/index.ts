import * as OSC from 'osc-js';

import { IzzyPannerParams, calcIzzyPannerVals } from './cropsy'

// Our Listener
// note: ZoomOSC allows you to set the outbound port since v3.2b18
const inHost = process.env.LISTEN_HOST || '0.0.0.0'
const inPort = process.env.LISTEN_PORT || 1235;

// Host/Port to send to Isadora (default is 1234)
const izzyHost = process.env.IZZY_HOST || '127.0.0.1';
const izzyPort = process.env.IZZY_PORT || 1234

// const obs = new OBSWebSocket();
const osc = new OSC({ plugin: new OSC.DatagramPlugin({
        open: {
            host: inHost,
            port: inPort,
        },
    })});

const izzy = new OSC( {plugin: new OSC.DatagramPlugin({
        send: {
            host: izzyHost,
            port: izzyPort
        }
    })});

/**
 * do it
 */
run();

/**
 * Start up the app
 */
function run() {

    // listen for inbound commands
    osc.open();
    console.log(`Listening to ${osc.options.plugin.options.open.host}:${osc.options.plugin.options.open.port}`);

    // setup listeners
    osc.on('/zgc/cropValues', async message => await doCalcAndSendIzzyPanner(message.args[0], message.args[1], message.args[2], true));

    // for debugging, output anything coming in
    // osc.on('*', message => {console.log("OSC * Message", message)});

    console.log(`Isadora should be listening to ${izzy.options.plugin.options.send.host}):${izzy.options.plugin.options.send.port}`);
    console.log(`Waiting for command "/zgc/cropValues <max-gal-size>"`);
}

async function sendToIsadora(message: string, ...args: any[]): Promise<any> {
    console.log(`Sending to Isadora (${izzy.options.plugin.options.send.host}):${izzy.options.plugin.options.send.port}: ${message}, ${args}`);
    return izzy.send(new OSC.Message(message, ...args));
}

/**
 * Calculate values for an Isadora Panner to crop to this piece of the screen
 *
 * @param width width of screen
 * @param height height of screen
 * @param count number of boxes
 * @param allUpTo boolean, do all of the different sizes up to the count (eg count=3 means 1, 2, and 3)
 */
async function doCalcAndSendIzzyPanner(width: number, height: number, count: number, allUpTo: boolean = false) {
    if (allUpTo) {
        for (let i=1; i <= count; i++) {
            await doSendIzzyPannerVals(width, height, i);
        }
    } else {
        await doSendIzzyPannerVals(width, height, count);
    }
}


async function doSendIzzyPannerVals(width: number, height: number, count: number) {
    let countStr = count <= 999 ? `00${count}`.slice(-3) : count;
    const izzyParams: IzzyPannerParams = calcIzzyPannerVals(width, height, count);
    await sendToIsadora(`/izzy/cropValues/${countStr}`,
        izzyParams.widthPercent,
        izzyParams.widthPercent,
        ...izzyParams.cropPercents);
}




