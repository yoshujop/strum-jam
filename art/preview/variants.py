"""Range proof for the Human builder: four extreme builds from the same code, written to a scratch
directory (not game assets).

    tools/art.sh art/preview/variants.py <outdir>      -> lanky.glb, round.glb, heavy.glb, petite.glb
"""
import importlib.util
import os
import sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from sjart import HumanSpec     # noqa: E402

sp = importlib.util.spec_from_file_location('mannequin', os.path.join(HERE, '..', 'chars', 'mannequin.py'))
mq = importlib.util.module_from_spec(sp)
sp.loader.exec_module(mq)

BASE = HumanSpec()
VARIANTS = {
    # 1.92 m string bean: long neck and limbs, narrow everything, huge hands and feet
    'lanky': (BASE.but(height=1.92, head_h=0.285, head_w=0.235, head_d=0.250, jaw=0.70, chin=0.8, neck_len=0.115, neck_r=0.040,
                       torso_len=0.47, shoulder_w=0.345, chest_w=0.265, chest_d=0.165, waist_w=0.215, waist_d=0.145, hip_w=0.265, hip_d=0.170,
                       upperarm_len=0.315, forearm_len=0.300, r_shoulder=0.040, r_bicep=0.032, r_elbow=0.028, r_forearm=0.031, r_wrist=0.023,
                       hand_len=0.250, hand_w=0.122, r_thigh=0.062, r_midthigh=0.052, r_knee=0.041, r_calf=0.044, r_ankle=0.030, foot_len=0.310),
              dict(skin='#E8B796', hair='#2B2D42', tee='#3BB8A5', trousers='#2B2D42', shoe='#F25C3B', sole='#FFFFFF', cap='#FFFFFF')),
    # 1.45 m and round: big head, barrel body with a belly, short thick limbs
    'round': (BASE.but(height=1.45, head_h=0.310, head_w=0.300, head_d=0.290, jaw=0.95, chin=0.1, cheek=1.0, neck_len=0.045, neck_r=0.055,
                       torso_len=0.43, shoulder_w=0.40, chest_w=0.400, chest_d=0.290, waist_w=0.450, waist_d=0.330, hip_w=0.450, hip_d=0.320,
                       belly=0.060, butt=0.03, torso_e=2.15, upperarm_len=0.215, forearm_len=0.195, r_shoulder=0.060, r_bicep=0.056, r_elbow=0.046,
                       r_forearm=0.050, r_wrist=0.034, hand_len=0.205, hand_w=0.125, hand_t=0.048, finger_r=0.021,
                       r_thigh=0.105, r_midthigh=0.090, r_knee=0.066, r_calf=0.068, r_ankle=0.044, foot_len=0.265, foot_w=0.120),
              dict(skin='#C98A5E', hair='#F2C14E', tee='#7A5CFA', trousers='#F2E9D8', shoe='#2B2D42', sole='#FFFFFF', cap='#FFFFFF')),
    # 1.86 m, broad and heavy: wide shoulders, deep chest, thick neck and limbs, small head
    'heavy': (BASE.but(height=1.86, head_h=0.275, head_w=0.250, head_d=0.262, jaw=1.0, chin=0.3, neck_len=0.060, neck_r=0.066,
                       torso_len=0.50, shoulder_w=0.510, chest_w=0.450, chest_d=0.290, waist_w=0.380, waist_d=0.260, hip_w=0.380, hip_d=0.250,
                       belly=0.020, trap=0.8, upperarm_len=0.290, forearm_len=0.265, r_shoulder=0.074, r_bicep=0.070, r_elbow=0.052, r_forearm=0.060,
                       r_wrist=0.038, hand_len=0.240, hand_w=0.140, hand_t=0.050, finger_r=0.0225,
                       r_thigh=0.102, r_midthigh=0.090, r_knee=0.064, r_calf=0.072, r_ankle=0.045, foot_len=0.300, foot_w=0.125),
              dict(skin='#8D5B3E', hair='#1F1B2E', tee='#F2F0E8', trousers='#5A3E2B', shoe='#D7263D', sole='#FFFFFF', cap='#FFFFFF')),
    # 1.52 m petite: slight frame, narrow shoulders, big head for the body, small hands and feet
    'petite': (BASE.but(height=1.52, head_h=0.285, head_w=0.255, head_d=0.258, jaw=0.68, chin=0.4, cheek=0.7, neck_len=0.075, neck_r=0.036,
                        torso_len=0.385, shoulder_w=0.290, chest_w=0.235, chest_d=0.155, waist_w=0.190, waist_d=0.130, hip_w=0.270, hip_d=0.175,
                        bust=0.014, upperarm_len=0.225, forearm_len=0.210, r_shoulder=0.035, r_bicep=0.029, r_elbow=0.025, r_forearm=0.028,
                        r_wrist=0.020, hand_len=0.180, hand_w=0.094, hand_t=0.032, finger_r=0.0148,
                        r_thigh=0.066, r_midthigh=0.056, r_knee=0.040, r_calf=0.043, r_ankle=0.027, foot_len=0.225, foot_w=0.088, foot_h=0.075),
               dict(skin='#F6C9A8', hair='#D7263D', tee='#FFC93C', trousers='#3A6EA5', shoe='#FFFFFF', sole='#2B2D42', cap='#2B2D42')),
}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:] or list(VARIANTS)
    for name in only:
        spec, pal = VARIANTS[name]
        mq.build(spec, name, pal).export(os.path.join(out, name + '.glb'), budget=(6000, 14000))
