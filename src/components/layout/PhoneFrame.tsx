import React from 'react';
import FramePhone, { type FramePhoneProps } from '../common/FramePhone';

export type PhoneFrameProps = FramePhoneProps;

export const PhoneFrame: React.FC<PhoneFrameProps> = (props) => {
  return <FramePhone {...props} />;
};

export default PhoneFrame;
