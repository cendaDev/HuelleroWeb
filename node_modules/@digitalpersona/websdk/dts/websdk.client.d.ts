declare namespace WebSdk {

    interface IWebChannelClient {
        /**
        * Callback invoked when client cannot connect to the server (because has no data in local storage or this data is obsolete).
        */
        onConnectionFailed: () => void;

        /**
        * Callback invoked when client successfully connected to the server.
        */
        onConnectionSucceed: () => void;

        /**
        * Callback invoked when binary data  is received from the server.
        * 
        * @param {ArrayBuffer} data
        */
        onDataReceivedBin: (data: ArrayBuffer) => void;

        /**
        * Callback invoked when binary data  is received from the server.
        * 
        * @param {string} data
        */
        onDataReceivedTxt: (data: string) => void;

        /**
        * Connects to the server with available configuration. If connection failed, onConnectionFailed callback will be called.
        */
        connect: (attempts?: number) => void;
        
        /**
        * Dicconnects from the server or stops attempts to restore lost connection.
        */
        disconnect: () => void;

        /**
        * Sends binary data to the server.
        * 
        * @param {ArrayBuffer} data
        */
        sendDataBin: (data: ArrayBuffer) => void;

        /**
        * Sends text data to the server.
        * 
        * @param {string} data
        */
        sendDataTxt: (data: string) => void;

        /**
        * Returns current connection state of the client.
        */
        isConnected(): boolean;
    }

    const enum WebSdkEncryptionSupport {
        None =  1,
        Encoding = 2,
        Encryption = 3,
        AESEncryption = 4
    }

    type WebChannelOptionsData = {
        debug?: boolean;                    // If true debug logs are outputted to browser Console
        version?: WebSdkEncryptionSupport;  // Version of WebSdk channel (1,2,3,etc.)
        reconnectAlways?: boolean;          // If true the client continuously attempts to restore connection (if false - only when the web page is active)
        port?: number;                      // Port for communication with local host. If not specified (default) the port 52181 will be used.
    }

    class WebChannelOptions
    {
        constructor(options?: WebChannelOptionsData);

        debug: boolean;                     // If true debug logs are outputted to browser Console
        version: WebSdkEncryptionSupport;   // Version of WebSdk channel (1,2,3,etc.)
        reconnectAlways: boolean;           // If true the client continuously attempts to restore connection (if false - only when the web page is active)
        port: number;                       // Port for communication with local host. If not specified (default) the port 52181 will be used.
    }

    class WebChannelClient implements IWebChannelClient {
        /**
        * Creates WebChannelClient
        * 
        * @param {string} path - the path that identifies registered WebSdk plugin
        * @param {WebChannelOptions} options - the options to configure web channel
        */
        constructor(path: string, options?: WebChannelOptionsData);

        onConnectionFailed(): void;

        onConnectionSucceed(): void;

        onDataReceivedBin(data: ArrayBuffer): void;

        onDataReceivedTxt(data: string): void;

        connect(attempts?: number): void;
        
        disconnect(): void;

        sendDataBin(data: ArrayBuffer): void;

        sendDataTxt(data: string): void;

        isConnected(): boolean;
    }
}