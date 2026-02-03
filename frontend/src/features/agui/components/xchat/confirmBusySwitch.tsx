import { Button, Space, Typography } from 'antd';
import * as React from 'react';

export type BusySwitchChoice = 'disconnect' | 'cancel' | 'stay';

type ConfirmInstance = {
  destroy: () => void;
};

type ModalApi = {
  confirm: (config: {
    title?: React.ReactNode;
    content?: React.ReactNode;
    footer?: React.ReactNode;
    maskClosable?: boolean;
    afterClose?: () => void;
  }) => ConfirmInstance;
};

export async function confirmBusySwitch(params: {
  modal: ModalApi;
  title: string;
  description: string;
  canCancel: boolean;
}): Promise<BusySwitchChoice> {
  const { modal, title, description, canCancel } = params;

  return await new Promise<BusySwitchChoice>((resolve) => {
    let resolved = false;

    const settle = (v: BusySwitchChoice) => {
      if (resolved) return;
      resolved = true;
      resolve(v);
    };

    const inst = modal.confirm({
      title,
      maskClosable: true,
      footer: null,
      afterClose: () => {
        settle('stay');
      },
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>{description}</Typography.Text>
          <Space wrap>
            <Button
              type="primary"
              onClick={() => {
                inst.destroy();
                settle('disconnect');
              }}
            >
              仅断开连接并切换
            </Button>
            <Button
              danger
              disabled={!canCancel}
              onClick={() => {
                inst.destroy();
                settle('cancel');
              }}
            >
              取消 Run 并切换
            </Button>
            <Button
              onClick={() => {
                inst.destroy();
                settle('stay');
              }}
            >
              留在当前
            </Button>
          </Space>
          {!canCancel ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前没有可取消的 run（可能缺少 activeRunId）。
            </Typography.Text>
          ) : null}
        </Space>
      ),
    });

    // 用户点遮罩或右上角关闭时走 stay（afterClose 会兜底 resolve）
  });
}
