import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";

import { useStorage } from "..";
import { SERVER_URL } from "@/Env";

export type LLMStatusAction = "searching" | "reranking" | "generating" | "end";

export interface LLMEndCompnData {
  CompnSn: number;
  ArrwCn: string | null;
  BeginArrwDrc: string;
  EndArrwDrc: string;
}

export interface LLMAttrbSaveParams {
  AttrbSn: number;
  AttrbSj?: string;
  AttrbCn?: string;
  AttrbRm?: string;
  DffTyCode: string;
  ReceiveOrgnztSns?: number[];
  ReceiveUserSns?: number[];
}

export interface LLMCompnData {
  CompnSn: number;
  EndCompns: LLMEndCompnData[] | null;
  CompnGroupSn: number | null;
  CompnTyCode: string;
  CompnSj: string;
  CompnCrdnt: { X: number; Y: number };
  Width: number;
  Hg: number;
  AtmcProgrsYn: string;
  CharstSort: string;
  FontSize: number;
  Color: string;
  CompnAttrbSaveParamsList: LLMAttrbSaveParams[];
}

interface UseLLMSignalRParams {
  groupName: string | null;
  onStatus: (action: LLMStatusAction) => void;
  onCompn: (compn: LLMCompnData) => void;
}

export default function useLLMSignalR({
  groupName,
  onStatus,
  onCompn,
}: UseLLMSignalRParams) {
  const { apiToken } = useStorage();
  const [connection, setConnection] = useState<signalR.HubConnection | null>(
    null
  );
  const startPromiseRef = useRef<Promise<void> | null>(null);

  // ref로 최신 콜백 유지 — SignalR useEffect dependency에서 제외해 매 렌더마다 재연결 방지
  const onStatusRef = useRef(onStatus);
  const onCompnRef = useRef(onCompn);
  useEffect(() => {
    onStatusRef.current = onStatus;
    onCompnRef.current = onCompn;
  });

  // connection 생성
  useEffect(() => {
    if (!apiToken) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${SERVER_URL}/oms-hub`, {
        withCredentials: false,
        accessTokenFactory: () => apiToken,
      })
      .withAutomaticReconnect()
      .build();
    setConnection(conn);
  }, [apiToken]);

  // groupName이 설정되면 연결 시작, 해제되면 연결 종료
  useEffect(() => {
    if (!connection || !groupName || connection.state !== "Disconnected")
      return;

    startPromiseRef.current = connection
      .start()
      .then(() => {
        console.log("[LLM SignalR] connected, joining group:", groupName);
        connection.invoke("AddGroup", groupName).catch(console.error);

        connection.on(
          "SendMessageToGroup",
          (_user: unknown, message: string) => {
            const msg = JSON.parse(message);
            console.log("msg:", msg);
            if (msg.subject === "LLMStatus") {
              console.log("[LLM SignalR] LLMStatus", msg.action);
              onStatusRef.current?.(msg.action as LLMStatusAction);
            } else if (msg.subject === "LLMCompn") {
              const compnData: LLMCompnData =
                typeof msg.action === "string"
                  ? JSON.parse(msg.action)
                  : msg.action;
              console.log(
                "[LLM SignalR] LLMCompn",
                compnData.CompnSn,
                compnData.CompnSj,
                compnData
              );
              onCompnRef.current?.(compnData);
            }
          }
        );
      })
      .catch(() => {});

    return () => {
      Promise.resolve(startPromiseRef.current).finally(() => {
        connection.off("SendMessageToGroup");
        if (connection.state === "Connected") {
          connection.stop().catch(() => {});
        }
      });
    };
  }, [connection, groupName]);
}
