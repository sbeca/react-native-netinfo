/**
 * Copyright (c) Nicolas Gallagher.
 * Copyright (c) Evan Bacon.
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import findIndex from 'array-find-index';
import invariant from 'fbjs/lib/invariant';

import {
    NetInfoState,
    NetInfoStateType,
} from './internal/types';

// Typescript definitions don't include these possible properties so let's extend the definitions
declare global {
    interface Navigator {
        connection?: NetworkInformation;
        mozConnection?: NetworkInformation;
        webkitConnection?: NetworkInformation;
    }
}

// Possible values from: https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
interface NetworkInformation extends EventTarget {
    /** Returns the effective bandwidth estimate in megabits per second (Mbps), rounded to the nearest multiple of 25 kilobits per seconds. */
    downlink: number;
    /** Returns the maximum downlink speed, in megabits per second (Mbps), for the underlying connection technology. */
    downlinkMax: number;
    /** Returns the effective type of the connection. This value is determined using a combination of recently observed round-trip time and downlink values. */
    effectiveType: NetworkInformationEffectiveType;
    /** Returns the estimated effective round-trip time of the current connection, rounded to the nearest multiple of 25 milliseconds. */
    rtt: number;
    /** Returns `true` if the user has set a reduced data usage option on the user agent. */
    saveData: boolean;
    /** Returns the type of connection a device is using to communicate with the network. */
    type: NetworkInformationType;
}

enum NetworkInformationType {
    bluetooth = 'bluetooth',
    cellular = 'cellular',
    ethernet = 'ethernet',
    none = 'none',
    wifi = 'wifi',
    wimax = 'wimax',
    other = 'other',
    unknown = 'unknown'
}

enum NetworkInformationEffectiveType {
    'slow-2g' = 'slow-2g',
    '2g' = '2g',
    '3g' = '3g',
    '4g' = '4g'
}

// Map React Native events to browser equivalents
const eventTypesMap = {
    change: 'change',
    connectionChange: 'change',
};
const eventTypes = Object.keys(eventTypesMap);

const connectionListeners = [];
const netInfoListeners = [];


// Prevent the underlying event handlers from leaking and include additional
// properties available in browsers
// TODO: Bacon: Refactor the native values so we aren't doing this weird emulation.
function getConnectionInfoObject(): Promise<NetInfoState> {
    const result: NetInfoState = {
        type: NetInfoStateType.unknown,
        isConnected: false,
        details: null,
    };

    const connection = getConnection();
    if (!connection) {
        result.isConnected = isConnectedFallback();
        return new Promise((resolve) => { resolve(result); });
    }

    for (const prop in connection) {
        const value = connection[prop];
        if (typeof value !== 'function' && value != null) {
            result[prop] = value;
        }
    }
    return {
        connectionType: result.type,
        effectiveConnectionType: result.effectiveType,
        ...result,
    };
}

function getConnection(): NetworkInformation | null {
    if (typeof (window) !== 'undefined' && typeof (window.navigator) !== 'undefined') {
        // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/connection#Browser_compatibility
        return (window.navigator.connection ||
            window.navigator.mozConnection ||
            window.navigator.webkitConnection ||
            null);
    }
    return null;
}

function isConnectedFallback(): boolean {
    if (typeof (window) !== 'undefined' && typeof (window.navigator) !== 'undefined') {
        // https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine#Browser_compatibility
        return window.navigator.onLine;
    }
    return false;
}

export const RNCNetInfo = {
    async getCurrentConnectivity(): Promise<NetInfoState> {
        return getConnectionInfoObject();
    },
};

export const NetInfoEventEmitter = {
    addEventListener(type: string, handler: Function) {
        if (type === 'networkStatusDidChange') {
            const connection = getConnection();
            if (!connection) {
                console.error(
                    'Network Connection API is not supported. Not listening for connection type changes.'
                );
                return {
                    remove: () => { },
                };
            }
            const wrappedHandler = () => handler(getConnectionInfoObject());
            netInfoListeners.push([handler, wrappedHandler]);
            connection.addEventListener(eventTypesMap[type], wrappedHandler);
        } else {
            const onlineCallback = () => handler(getConnectionInfoObject());
            const offlineCallback = () => handler(getConnectionInfoObject());
            connectionListeners.push([handler, onlineCallback, offlineCallback]);

            window.addEventListener('online', onlineCallback, false);
            window.addEventListener('offline', offlineCallback, false);
        }

        return {
            remove() {
                if (type === 'networkStatusDidChange') {
                    const listenerIndex = findIndex(netInfoListeners, pair => pair[0] === handler);
                    invariant(listenerIndex !== -1, 'Trying to remove NetInfo listener for unregistered handler');
                    const [, wrappedHandler] = netInfoListeners[listenerIndex];
                    const connection = getConnection();
                    if (!connection) {
                        throw new Error(
                            'Network Connection API is not supported. Not listening for connection type changes.'
                        );
                    }
                    connection.removeEventListener(eventTypesMap[type], wrappedHandler);
                    netInfoListeners.splice(listenerIndex, 1);
                    return;
                }
                invariant(
                    eventTypes.indexOf(type) !== -1,
                    'Trying to subscribe to unknown event: "%s"',
                    type
                );
                if (type === 'change') {
                    console.warn('Listening to event `change` is deprecated. Use `connectionChange` instead.');
                }

                const listenerIndex = findIndex(connectionListeners, pair => pair[0] === handler);
                invariant(
                    listenerIndex !== -1,
                    'Trying to remove NetInfo connection listener for unregistered handler'
                );
                const [, onlineCallback, offlineCallback] = connectionListeners[listenerIndex];

                window.removeEventListener('online', onlineCallback, false);
                window.removeEventListener('offline', offlineCallback, false);

                connectionListeners.splice(listenerIndex, 1);
            },
        };
    },
};
