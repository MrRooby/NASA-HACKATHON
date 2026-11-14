import sys, datetime; sys.path.insert(0, sys.argv[1]); from marstime import msl_sol
u=datetime.timezone.utc
for d,exp in [((2024,5,1,0,12,10),4171),((2012,8,17,10,20,37),11),((2025,4,3,6,54,37),4500)]:
    print(d, msl_sol(datetime.datetime(*d,tzinfo=u)), exp)
